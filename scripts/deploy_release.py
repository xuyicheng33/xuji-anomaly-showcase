from pathlib import Path
import datetime
import argparse
import hashlib
import json
import shlex
import subprocess
import tarfile
import paramiko
from release_validation import validate_evaluation, window_location_config

parser = argparse.ArgumentParser(description='Publish the verified dist to the dedicated 9010 site using the local SSH key.')
parser.add_argument('--qa-dir', type=Path, default=Path('.qa/deployment'))
parser.add_argument('--scope', default='Verified production release', help='Describe the changes included in this release.')
args = parser.parse_args()
root=Path(__file__).resolve().parents[1]
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
release=commit[:7]
if subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True).strip():
    raise RuntimeError('Commit the release changes before deployment.')
record=json.loads((root/'.qa/build.json').read_text(encoding='utf-8'))
if not record.get('verified') or record['commit'] != commit:
    raise RuntimeError('Run npm run verify on this commit before deployment.')
subprocess.run(['node', 'scripts/build_record.mjs', 'check'], cwd=root, check=True)
out=args.qa_dir.resolve()
out.mkdir(parents=True, exist_ok=True)
dist=root/'dist'
records={p.relative_to(dist).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in dist.rglob('*') if p.is_file() and p.suffix!='.gz'}
if records != record['files']:
    raise RuntimeError('Production files differ from the verified build.')
validate_evaluation(dist / 'data/journey', root / 'data/reference/manifest.json')
client=paramiko.SSHClient();client.load_host_keys(str(Path.home()/'.ssh/known_hosts'))
client.connect('124.223.175.32',username='ubuntu',key_filename=str(Path.home()/'.ssh/xuji_showcase_ed25519'),look_for_keys=False,allow_agent=False,timeout=20)

def run(command):
    _,stdout,stderr=client.exec_command(command,timeout=120)
    text=stdout.read().decode();error=stderr.read().decode();status=stdout.channel.recv_exit_status()
    if status:raise RuntimeError(f'Command failed ({status}): {error}\n{text}')
    return text

def remote_python(source):return run('python3 -c '+shlex.quote(source))

previous=run('readlink -f /var/www/xuji-showcase/current').strip()
old=json.loads(remote_python("from pathlib import Path;import hashlib,json;p=Path("+repr(previous)+");print(json.dumps({f.relative_to(p).as_posix():hashlib.sha256(f.read_bytes()).hexdigest() for f in p.rglob('*') if f.is_file() and f.suffix!='.gz'}))"))
changed=[name for name,digest in records.items() if old.get(name)!=digest]
archive=out/'release-changes.tar.gz'
with tarfile.open(archive,'w:gz') as tar:
    for name in changed:tar.add(dist/name,arcname=name)
print(json.dumps({'release':release,'changedFiles':len(changed),'uploadBytes':archive.stat().st_size}),flush=True)
staging='/home/ubuntu/xuji-home-data-'+release
target='/var/www/xuji-showcase/releases/'+release
run('mkdir -p '+shlex.quote(staging))
sftp=client.open_sftp();sftp.put(str(archive),staging+'/changes.tar.gz')
with sftp.open(staging+'/files.json','w') as file:file.write(json.dumps(records))
# Install only the window location; preserve other applications in the site's configuration.
config=(root/'deploy/nginx-9010.conf').read_text(encoding='utf8')
begin=config.index('    location ^~ /data/journey/windows-v1/ {')
end=config.index('\n    }',begin)+len('\n    }')
with sftp.open(staging+'/window-location.conf','w') as file:file.write(config[begin:end])
existing_config=remote_python("from pathlib import Path;print(Path('/etc/nginx/conf.d/xuji-showcase-9010.conf').read_text(),end='')")
updated_config=window_location_config(existing_config,config[begin:end])
with sftp.open(staging+'/site.conf','w') as file:file.write(updated_config)
sftp.close()
source=f'''
from pathlib import Path
import json,hashlib,gzip,shutil,tarfile,os
previous=Path({previous!r});target=Path({target!r});staging=Path({staging!r})
assert target.parent==Path('/var/www/xuji-showcase/releases')
if target.exists():raise RuntimeError('Release already exists')
shutil.copytree(previous,target)
with tarfile.open(staging/'changes.tar.gz') as tar:
 for member in tar.getmembers():
  assert (target/member.name).resolve().is_relative_to(target.resolve())
 tar.extractall(target,filter='data')
expected=json.loads((staging/'files.json').read_text())
for file in list(target.rglob('*')):
 if file.is_file() and file.suffix!='.gz' and file.relative_to(target).as_posix() not in expected:
  file.unlink()
for name,digest in expected.items():
 file=target/name;raw=file.read_bytes()
 assert hashlib.sha256(raw).hexdigest()==digest,name
 zipped=file.with_name(file.name+'.gz')
 if zipped.exists() and gzip.decompress(zipped.read_bytes()) != raw:zipped.unlink()
 if name in {changed!r} and len(raw)>=1024 and file.suffix in {{'.bin','.json','.js','.css','.svg','.html'}}:
  packed=gzip.compress(raw,compresslevel=6,mtime=0)
  if len(packed)<len(raw):
   zipped.write_bytes(packed)
   assert gzip.decompress(zipped.read_bytes())==raw
for file in list(target.rglob('*.gz')):
 if not file.with_suffix('').exists():file.unlink()
for file in target.rglob('*.gz'):
 assert gzip.decompress(file.read_bytes())==file.with_suffix('').read_bytes(),str(file)
print(json.dumps({{'verifiedFiles':len(expected),'release':str(target)}}))
'''
print(run('sudo -n python3 -c '+shlex.quote(source)),flush=True)
config_path='/etc/nginx/conf.d/xuji-showcase-9010.conf'
config_backup='/var/www/xuji-showcase/config-backups/'+release+'.conf'
config_update=f'''
from pathlib import Path
import hashlib
config=Path({config_path!r});backup=Path({config_backup!r})
text=config.read_text()
assert hashlib.sha256(text.encode()).hexdigest()=={hashlib.sha256(existing_config.encode()).hexdigest()!r}
assert not backup.exists()
backup.parent.mkdir(parents=True,exist_ok=True);backup.write_text(text)
config.write_bytes(Path({staging!r}+'/site.conf').read_bytes())
'''
try:
    run('sudo -n python3 -c '+shlex.quote(config_update))
    run('sudo -n nginx -t')
    run('sudo -n ln -s '+shlex.quote(target)+' /var/www/xuji-showcase/current-next && sudo -n mv -Tf /var/www/xuji-showcase/current-next /var/www/xuji-showcase/current')
    run('sudo -n systemctl reload nginx')
    assert run('curl -fsS -o /dev/null -w "%{http_code}" http://127.0.0.1:9010/')=='200'
    # A browser sends Accept-Encoding automatically. Confirm offsets still refer to raw data.
    chunk=json.loads((dist/'data/journey/manifest.json').read_text(encoding='utf8'))['models'][0]['windows']['chunks'][0]
    probe=f'''
from urllib.request import Request,urlopen
from pathlib import Path
url='http://127.0.0.1:9010/data/journey/'+{chunk['file']!r}
response=urlopen(Request(url,headers={{'Range':'bytes=0-31999','Accept-Encoding':'gzip'}}))
assert response.status==206 and response.headers.get('Content-Encoding') is None
assert response.read()==Path({target!r}+'/data/journey/'+{chunk['file']!r}).read_bytes()[:32000]
'''
    remote_python(probe)
except Exception:
    restore=f'''
from pathlib import Path
import os
backup=Path({config_backup!r})
if backup.exists():Path({config_path!r}).write_bytes(backup.read_bytes())
current=Path('/var/www/xuji-showcase/current-rollback')
current.unlink(missing_ok=True);current.symlink_to({previous!r})
os.replace(current,'/var/www/xuji-showcase/current')
'''
    run('sudo -n python3 -c '+shlex.quote(restore))
    run('sudo -n nginx -t && sudo -n systemctl reload nginx')
    raise
record={'release':release,'previousRelease':Path(previous).name,'url':'http://124.223.175.32:9010/','releasePath':target,'verifiedFiles':len(records),'changedFiles':len(changed),'uploadedBytes':archive.stat().st_size,'scope':args.scope,'deployedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
run('sudo -n python3 -c '+shlex.quote("from pathlib import Path;Path('/var/www/xuji-showcase/deployment.json').write_text("+repr(json.dumps(record,indent=2))+')'))
remote_python("from pathlib import Path;import shutil;p=Path("+repr(staging)+");assert p.parent==Path('/home/ubuntu') and p.name.startswith('xuji-home-data-');shutil.rmtree(p)")
(out/'deploy-result.json').write_text(json.dumps(record,indent=2),encoding='utf8')
archive.unlink();client.close();print(json.dumps(record),flush=True)
