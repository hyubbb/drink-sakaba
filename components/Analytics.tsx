import Script from "next/script";

// GA4 measurement ID is public (it ships in every page's HTML), so a fallback is fine.
// Override with NEXT_PUBLIC_GA_ID, or set it to "off" to disable.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "G-FRFMHY6WQ0";

export default function Analytics() {
  // Only send hits from production builds so `next dev` doesn't pollute the data.
  if (process.env.NODE_ENV !== "production" || GA_ID === "off") return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
      </Script>
    </>
  );
}
