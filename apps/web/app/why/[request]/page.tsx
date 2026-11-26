import Studio from "../../../src/studio";

export function generateStaticParams() { return [{ request: "current" }]; }

export default function Why() { return <Studio view="why" />; }
