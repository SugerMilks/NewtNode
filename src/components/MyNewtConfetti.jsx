const colors = ["#f0c83b", "#58ce63", "#3d85ff", "#ff4fb3", "#14d8c8"];
const particles = Array.from({ length: 26 }, (_, index) => {
  const spread = (index / 25) * 2 - 1;
  return {
    "--confetti-color": colors[index % colors.length],
    "--confetti-x": `${Math.round(spread * 175)}px`,
    "--confetti-rise": `${-70 - (index * 29 % 65)}px`,
    "--confetti-fall": `${70 + (index * 19 % 90)}px`,
    "--confetti-spin": `${(index % 2 ? 1 : -1) * (180 + index * 31)}deg`,
    "--confetti-delay": `${index % 5 * 24}ms`
  };
});

export function MyNewtConfetti() {
  return <div className="my-newt-confetti" aria-hidden="true">
    {particles.map((style, index) => <span key={index} style={style} />)}
  </div>;
}
