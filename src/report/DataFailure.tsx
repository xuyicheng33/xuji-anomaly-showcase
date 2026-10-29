export default function DataFailure({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="state-panel" role="alert">
      <h2>{message}</h2>
      <button className="primary" onClick={retry}>
        重新读取
      </button>
    </div>
  );
}
