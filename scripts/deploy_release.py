from pathlib import Path
import datetime
import argparse
import hashlib
import json
import shlex
import subprocess
import tarfile
import paramiko
from release_validation import validate_evaluation

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
run('sudo -n nginx -t')
run('sudo -n ln -s '+shlex.quote(target)+' /var/www/xuji-showcase/current-next && sudo -n mv -Tf /var/www/xuji-showcase/current-next /var/www/xuji-showcase/current')
run('sudo -n systemctl reload nginx')
assert run('curl -fsS -o /dev/null -w "%{http_code}" http://127.0.0.1:9010/')=='200'
record={'release':release,'previousRelease':Path(previous).name,'url':'http://124.223.175.32:9010/','releasePath':target,'verifiedFiles':len(records),'changedFiles':len(changed),'uploadedBytes':archive.stat().st_size,'scope':args.scope,'deployedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
run('sudo -n python3 -c '+shlex.quote("from pathlib import Path;Path('/var/www/xuji-showcase/deployment.json').write_text("+repr(json.dumps(record,indent=2))+')'))
remote_python("from pathlib import Path;import shutil;p=Path("+repr(staging)+");assert p.parent==Path('/home/ubuntu') and p.name.startswith('xuji-home-data-');shutil.rmtree(p)")
(out/'deploy-result.json').write_text(json.dumps(record,indent=2),encoding='utf8')
archive.unlink();client.close();print(json.dumps(record),flush=True)
