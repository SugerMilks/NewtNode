import React from "react";
import { ImageOff } from "lucide-react";
import { looksApi } from "../api/newtApi.js";

export default function LookImage({ image, thumbnail, ...props }) {
  const url = image?.localUrl || image?.url || "";
  const catalog = url.startsWith("/api/style-library/stylefinder-image?");
  const shared = url.startsWith("/api/looks/shared/image?");
  const film = url.startsWith("/api/looks/film-stills/image?");
  const managed = /^\/(uploads|outputs|workflow-assets)\//.test(url) && !/\.\.|[?#\\]/.test(url);
  const src = catalog || shared || film || managed ? looksApi.imageUrl(`${url}${catalog && thumbnail ? "&thumbnail=1" : ""}`) : "";
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);
  return src && !failed ? <img {...props} src={src} onError={() => setFailed(true)} loading="lazy" decoding="async" />
    : <span className="look-image-missing" title="Local image unavailable"><ImageOff size={24} /></span>;
}
