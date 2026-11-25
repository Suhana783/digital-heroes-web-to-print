import { apiRequest } from '../../services/api.js';
import { useResource } from '../../hooks/useResource.js';
import { DivisionCard } from '../../features/catalogue/DivisionCard.jsx';
import { RequestState } from '../../components/ui/RequestState.jsx';
import { SiteLayout } from '../../components/layout/SiteLayout.jsx';

export default function CatalogueHome() {
  const { data, loading, error, retry } = useResource(
    (signal) => apiRequest('/catalogue/divisions', { signal }),
  );

  return (
    <SiteLayout>
      <main>
        <section className="hero page-gutter catalogue-hero">
          <div className="hero-copy">
            <p className="eyebrow"><span className="live-dot" /> MADE TO ORDER · MADE WITH INTENT</p>
            <h1>Good things<br />start with <em>making.</em></h1>
            <div className="hero-bottom">
              <p className="hero-description">Thoughtful tools, quality materials, and a real team behind every custom print and fabrication order.</p>
              <a className="text-link" href="#divisions">Explore the workshop <span>↓</span></a>
            </div>
          </div>
          <div className="hero-art" role="img" aria-label="Abstract geometric illustration">
            <div className="art-sun" /><div className="art-ring ring-one" /><div className="art-ring ring-two" />
            <div className="art-block block-one" /><div className="art-block block-two" />
            <span className="art-caption">IDEAS, MADE TANGIBLE<br />EST. WITH PURPOSE</span><span className="art-index">DH—001</span>
          </div>
        </section>
        <section className="divisions-section page-gutter" id="divisions">
          <div className="section-heading">
            <div><p className="eyebrow">THE WORKSHOP</p><h2>Find your way<br />to make it <em>yours.</em></h2></div>
            <p className="section-intro">Browse our active divisions and find the right place to start your next idea.</p>
          </div>
          <RequestState loading={loading} error={error} onRetry={retry} empty={data?.length === 0 && 'Our catalogue is being prepared. Please check back soon.'}>
            <div className="division-grid">
              {data?.map((division, index) => <DivisionCard key={division.id} division={division} index={index} />)}
            </div>
          </RequestState>
        </section>
        <section className="closing page-gutter"><p className="eyebrow">A GOOD PLACE TO BEGIN</p><p>Tell us what you’re dreaming up.<br /><a href="mailto:hello@digitalheroes.in">We’ll help you make it real <span>↗</span></a></p></section>
      </main>
    </SiteLayout>
  );
}
