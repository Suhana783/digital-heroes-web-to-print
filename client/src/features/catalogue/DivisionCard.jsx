import { Link } from 'react-router-dom';

export function DivisionCard({ division, index }) {
  return (
    <Link className="division-card catalogue-card" to={`/catalogue/${division.slug}`}>
      <div className="card-top"><span>{String(index + 1).padStart(2, '0')} / DIVISION</span><span className="card-mark" aria-hidden="true">↗</span></div>
      <div>
        <h3>{division.name}</h3>
        <p>{division.description || 'No division description is available.'}</p>
      </div>
      <span className="card-arrow" aria-hidden="true">Explore division ↗</span>
    </Link>
  );
}
