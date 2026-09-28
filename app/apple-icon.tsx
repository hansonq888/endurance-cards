import { ImageResponse } from "next/og";
import { TURTLE_ICON_ORANGE, turtleDataUri } from "@/lib/turtle";

/** Home-screen icon: the turtle on an orange tile, so it stands out among other apps. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <img src={turtleDataUri(TURTLE_ICON_ORANGE, 180)} alt="" width={180} height={180} />,
    size,
  );
}
