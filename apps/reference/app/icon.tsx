import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "linear-gradient(145deg, #17242B, #355C70 65%, #6C5B7B)",
          color: "#F2C14E",
          display: "flex",
          fontSize: 34,
          fontWeight: 800,
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        R
      </div>
    ),
    size,
  );
}
