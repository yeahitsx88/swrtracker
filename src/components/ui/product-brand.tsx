import Image from 'next/image';

/** Supplied Axiom artwork; keep its proportions and clear space intact. */
export function ProductBrand({ greeting }: { greeting?: string }) {
  return (
    <div className="product-brand">
      <span className="axiom-mark-frame">
        <Image className="axiom-wordmark" src="/brand/axiom-wordmark.png" alt="Axiom Civil Services" width={1600} height={1280} sizes="(max-width: 600px) 112px, 144px" priority />
      </span>
      <span className={`product-name${greeting ? ' account-greeting' : ''}`}>{greeting ?? 'SWRTracker'}</span>
    </div>
  );
}
