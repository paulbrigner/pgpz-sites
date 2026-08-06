import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// Board favicon: evergreen rounded tile with the PGPZ gold plain-ring motif and
// a paper centre dot — mirrors the BoardMark seal. No official Zcash roundel.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "linear-gradient(150deg, #0D1F20, #102827 62%, #2B3B3A)",
          borderRadius: 22,
          display: "flex",
          height: "100%",
          justifyContent: "center",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            border: "3px solid #F5A800",
            borderRadius: 9999,
            height: 40,
            position: "absolute",
            width: 40,
          }}
        />
        <div
          style={{
            borderRadius: 9999,
            height: 12,
            position: "absolute",
            width: 12,
            background: "#F6FAF2",
          }}
        />
      </div>
    ),
    size,
  );
}
