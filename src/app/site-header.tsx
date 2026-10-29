import { Mark } from "./mark";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="frame site-bar">
        <a className="wordmark" href="#command">
          <Mark />
          <span>Stackroots</span>
        </a>
        <a className="author" href="https://github.com/fab-c14">
          fab-c14
        </a>
      </div>
    </header>
  );
}
