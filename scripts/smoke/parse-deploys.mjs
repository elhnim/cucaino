let d = "";
process.stdin.on("data", (c) => (d += c)).on("end", () => {
  const a = JSON.parse(d);
  for (const x of a) {
    console.log((x.created_at || "").slice(0, 19), "|", x.state, "| ctx:", x.context, "| branch:", x.branch, "| ", (x.title || "").slice(0, 50));
  }
});
