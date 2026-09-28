import { ImageResponse } from "next/og";
import { TURTLE_ICON, turtleDataUri } from "@/lib/turtle";

/**
 * App icon (favicon, and the image uploaded to the Strava API app page):
 * the Kudex turtle, its shell a topo map, on the site background.
 */
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <img src={turtleDataUri(TURTLE_ICON, 512)} alt="" width={512} height={512} />,
    size,
  );
}
