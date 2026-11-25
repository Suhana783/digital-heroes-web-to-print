export function RequestState({ loading, error, onRetry, empty, children }) {
  if (loading) {
    return <div className="request-state" role="status"><span className="state-kicker">PLEASE WAIT</span><p>Loading the workshop catalogue…</p></div>;
  }
  if (error) {
    return (
      <div className="request-state request-error" role="alert">
        <span className="state-kicker">SOMETHING WENT WRONG</span><p>{error.message}</p>
        <button className="button-link" type="button" onClick={onRetry}>Try again <span>↻</span></button>
      </div>
    );
  }
  if (empty) {
    return <div className="request-state"><span className="state-kicker">COMING SOON</span><p>{empty}</p></div>;
  }
  return children;
}
