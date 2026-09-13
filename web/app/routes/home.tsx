import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Restyle" },
    { name: "description", content: "Where you left off" },
  ];
}

/**
 * The landing page renders nothing of its own: the note is the workspace
 * layout's, so that it survives the trip to the grid. Being the index route is
 * what puts the surface in its full-page mode.
 */
export default function Home() {
  return null;
}
