export const genreGuide = [
  { name: "Architecture", poster: "spiral-to-the-light", subject: "Buildings & designed spaces" },
  { name: "Art", poster: "drawing-with-light", subject: "Images, objects & performance" },
  { name: "Culture", poster: "painted-faces", subject: "Traditions & daily life" },
  { name: "Documentary", poster: "opening-the-hive", subject: "Work, routines & processes" },
  { name: "Food", poster: "first-pour", subject: "Cooking & ingredients" },
  { name: "Nature", poster: "northern-current", subject: "Wildlife & landscapes" },
  { name: "Science", poster: "the-past-in-ice", subject: "Experiments & observation" },
  { name: "Sports", poster: "blue-break", subject: "Athletes & training" },
  { name: "Technology", poster: "pick-and-place", subject: "Tools, machines & electronics" },
  { name: "Travel", poster: "window-to-the-alps", subject: "Places & journeys" },
];

export function GenreLabel({ name, secondary = false }: { name: string; secondary?: boolean }) {
  return <span className={secondary ? "genre-label genre-label-secondary" : "genre-label"} data-genre={name}>{name}</span>;
}
