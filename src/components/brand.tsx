import Image from "next/image";
import Link from "next/link";
import compactLogo from "../../public/brand/Small Logo.png";
import fullLogo from "../../public/brand/Full Main Logo.png";
import wordsLogo from "../../public/brand/H2H Words Only Logo.png";

export function BrandSignature({ footer=false }: { footer?:boolean }) {
  if (!footer) return <Link className="brand header-brand" href="/marketplace" aria-label="Hospital2Hospital marketplace home">
    <Image className="brand-words-logo" src={wordsLogo} alt="Hospital2Hospital — Better connections. Less waste." sizes="(max-width: 360px) 140px, (max-width: 500px) 160px, (max-width: 1150px) 280px, 320px" preload/>
  </Link>;
  return <Link className={`brand brand-signature${footer ? " footer-brand" : ""}`} href="/" aria-label="Hospital2Hospital home">
    <Image className="brand-compact-logo" src={compactLogo} alt="" width={88} height={44} sizes="(max-width: 500px) 56px, 88px" preload={!footer}/>
    <span className="brand-wordmark">Hospital<span className="brand-two">2</span>Hospital<small>THE FACILITY-TO-FACILITY MARKETPLACE</small></span>
  </Link>;
}

export function FullBrandLogo() {
  return <div className="brand-story-visual"><Image src={fullLogo} alt="Hospital2Hospital — Better connections. Less waste." sizes="(max-width: 800px) 90vw, 720px"/></div>;
}
