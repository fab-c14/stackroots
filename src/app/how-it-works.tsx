export function HowItWorks() {
  return (
    <section className="how" id="how">
      <h2>What the command does</h2>
      <div className="rules">
        <div>
          <h3>Report</h3>
          <p>
            Reads the nearest package.json and lockfile. Lists each root, then names the one that pulls the most packages.
            It does not call npm.
          </p>
        </div>
        <div>
          <h3>Check</h3>
          <p>
            Looks up the latest npm release. Compares peers, deprecations, major changes, and Node. Prints what to do. An
            error exits 1.
          </p>
        </div>
      </div>
      <ul className="kind-key" aria-label="Root colors">
        <li data-kind="runtime">Runtime</li>
        <li data-kind="dev">Dev</li>
        <li data-kind="optional">Optional</li>
        <li data-kind="peer">Peer</li>
      </ul>
      <div className="gemma-note" id="gemma">
        <h2>What this page adds</h2>
        <p>
          The same check, in the browser. When a check finds a problem, Gemma 4 writes the fix. A note on one root runs
          only when you press Ask Gemma 4 what this needs. The raw package.json stays in this browser. Only public package
          facts are sent.
        </p>
      </div>
    </section>
  );
}
