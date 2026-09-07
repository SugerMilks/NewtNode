export function NewtIcon({ size = 24 }) {
  return <span
    className="newt-icon"
    aria-hidden="true"
    style={{ "--newt-icon-size": `${size}px` }}
  />;
}
