export type TreeSpriteType = "pine" | "oak" | "silhouette";

export type TreeAtlas = {
  base: Record<TreeSpriteType, HTMLImageElement[]>;
  overlays: Partial<Record<TreeSpriteType, HTMLImageElement[]>>;
};

const manifest = {
  base: {
    pine: ["/pixel/trees/pine/pine-1.svg", "/pixel/trees/pine/pine-2.svg"],
    oak: ["/pixel/trees/oak/oak-1.svg", "/pixel/trees/oak/oak-2.svg"],
    silhouette: ["/pixel/trees/silhouette/silhouette-1.svg", "/pixel/trees/silhouette/silhouette-2.svg"]
  },
  overlays: {
    pine: [
      "/pixel/trees/overlays/pine-tip-0.svg",
      "/pixel/trees/overlays/pine-tip-1.svg",
      "/pixel/trees/overlays/pine-tip-2.svg"
    ],
    oak: [
      "/pixel/trees/overlays/oak-tip-0.svg",
      "/pixel/trees/overlays/oak-tip-1.svg",
      "/pixel/trees/overlays/oak-tip-2.svg"
    ]
  }
} as const;

const imageCache = new Map<string, Promise<HTMLImageElement>>();
let atlasCache: Promise<TreeAtlas> | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) {
    return cached;
  }

  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load sprite: ${src}`));
    image.src = src;
  });

  imageCache.set(src, pending);
  return pending;
}

async function loadGroup(paths: readonly string[]) {
  return Promise.all(paths.map((path) => loadImage(path)));
}

export function loadTreeAtlas(): Promise<TreeAtlas> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Tree atlas can only be loaded in the browser"));
  }

  if (atlasCache) {
    return atlasCache;
  }

  atlasCache = Promise.all([
    loadGroup(manifest.base.pine),
    loadGroup(manifest.base.oak),
    loadGroup(manifest.base.silhouette),
    loadGroup(manifest.overlays.pine),
    loadGroup(manifest.overlays.oak)
  ]).then(([pine, oak, silhouette, pineOverlay, oakOverlay]) => ({
    base: {
      pine,
      oak,
      silhouette
    },
    overlays: {
      pine: pineOverlay,
      oak: oakOverlay
    }
  }));

  return atlasCache;
}
