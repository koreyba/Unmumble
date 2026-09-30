import type { Metadata } from "next";

const title = "Unmumble — Learn to understand spoken English.";
const description = "Listen. Check. Repeat. Hear.";

export function socialPreviewMetadata(preview?: string | string[]): Pick<Metadata, "openGraph" | "twitter"> {
  const dark = preview === "dark";
  const image = {
    url: dark ? "/og-dark.png?v=2" : "/og.png?v=2",
    width: 1200,
    height: 630,
    alt: "Unmumble. Learn to understand spoken English. Listen. Check. Repeat. Hear.",
  };

  return {
    openGraph: {
      type: "website",
      title,
      description,
      siteName: "Unmumble",
      url: dark ? "/?preview=dark" : "/",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
