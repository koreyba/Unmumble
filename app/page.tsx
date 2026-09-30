import Link from "next/link";
import { SiteNavigation } from "@/app/components/site-navigation";
import { ArrowUpRightIcon, ButtonLink } from "@/app/components/ui";

export default function Home() {
  return (
    <>
      <SiteNavigation active="home" />
      <main className="landing-page">
        <section aria-labelledby="landing-title" className="landing-hero">
          <div aria-hidden="true" className="landing-orbit landing-orbit-one" />
          <div aria-hidden="true" className="landing-orbit landing-orbit-two" />

          <div className="landing-hero-copy">
            <p className="landing-kicker ui-rise" style={{ "--ui-index": 0 } as React.CSSProperties}><span aria-hidden="true" />Connected speech trainer</p>
            <h1 className="ui-rise" id="landing-title" style={{ "--ui-index": 1 } as React.CSSProperties}>
              <span>You know the words.</span>
              <span className="landing-title-accent">Learn to hear them.</span>
            </h1>
            <p className="landing-intro ui-rise" style={{ "--ui-index": 2 } as React.CSSProperties}>
              In real speech, words can sound different. They join together, become shorter, or lose sounds. Unmumble helps you find a phrase, listen to it, slow it down, and read the captions. Repeat until you can hear the words clearly on your own.
            </p>
            <div className="landing-actions ui-rise" style={{ "--ui-index": 3 } as React.CSSProperties}>
              <ButtonLink href="/practice" pill size="lg" variant="primary">
                Start Listening <ArrowUpRightIcon size={18} />
              </ButtonLink>
              <ButtonLink href="/library" pill size="lg">
                Explore Hard-to-Hear Phrases
              </ButtonLink>
            </div>
          </div>

          <aside aria-label="The Unmumble learning loop" className="landing-sound-card">
            <div className="landing-card-topline">
              <span>Sound</span>
              <span className="landing-card-status"><i aria-hidden="true" />Clear</span>
            </div>
            <div aria-hidden="true" className="landing-waveform">
              {[42, 68, 30, 82, 55, 94, 38, 72, 48, 88, 62, 100, 46, 78, 34, 66, 52, 86, 40, 70].map((height, index) => (
                <span key={`${height}-${index}`} style={{ height: `${height}%`, "--i": index } as React.CSSProperties} />
              ))}
            </div>
            <p className="landing-card-message">Turn one long sound into words you can hear.</p>
            <div className="landing-card-steps">
              <span>Listen</span>
              <i aria-hidden="true" />
              <span>Check</span>
              <i aria-hidden="true" />
              <span>Repeat</span>
              <i aria-hidden="true" />
              <strong>Hear</strong>
            </div>
          </aside>
        </section>

        <section aria-labelledby="landing-problem-title" className="landing-problem">
          <div className="landing-section-label landing-reveal"><span>01</span> Why it works</div>
          <div className="landing-problem-grid landing-reveal">
            <h2 id="landing-problem-title">Listening more is <em>not always</em> enough.</h2>
            <div>
              <p>
                Sometimes, English sounds like one long sound. You listen again, but still cannot hear the words. Progress begins when you connect the sounds with the actual words—and repeat until the phrase becomes recognizable without captions.
              </p>
              <div aria-hidden="true" className="landing-clarity-scale">
                <div><span>Before</span><strong>One long sound.</strong></div>
                <i />
                <div><span>After</span><strong>Words you can hear.</strong></div>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="landing-method-title" className="landing-method">
          <div className="landing-method-inner">
            <div className="landing-section-label landing-section-label-dark landing-reveal"><span>02</span> How to train</div>
            <div className="landing-method-heading landing-reveal">
              <h2 id="landing-method-title">Listen. Check.<br />Repeat. Hear.</h2>
              <p>Listen to the phrase. Read the captions. Slow it down if you need to. Repeat until you can hear the words without reading them.</p>
            </div>
            <ol className="landing-method-grid landing-reveal">
              <li><span>01</span><strong>Listen</strong><p>Hear the phrase in real speech.</p></li>
              <li><span>02</span><strong>Check</strong><p>Read the words in the captions.</p></li>
              <li><span>03</span><strong>Repeat</strong><p>Play it again. Slow it down.</p></li>
              <li><span>04</span><strong>Hear</strong><p>Listen without reading the words.</p></li>
            </ol>
          </div>
        </section>

        <section aria-labelledby="landing-focus-title" className="landing-focus">
          <div className="landing-section-label landing-reveal"><span>03</span> What to practice</div>
          <div className="landing-focus-grid landing-reveal">
            <div className="landing-focus-copy">
              <h2 id="landing-focus-title">The hardest English is often made of the <em>easiest words.</em></h2>
              <p>Long words are often easier to hear. Short, common words can join together. Their sounds can change or disappear. Unmumble groups these changes, so you can practice the phrases that are hard to hear.</p>
              <Link className="landing-text-link" href="/library">Explore Hard-to-Hear Phrases <ArrowUpRightIcon size={18} /></Link>
            </div>
            <div aria-label="Common changes in real speech" className="landing-patterns">
              <div><span>Words</span><strong>join together</strong><i aria-hidden="true">01</i></div>
              <div><span>Sounds</span><strong>become shorter</strong><i aria-hidden="true">02</i></div>
              <div><span>Sounds</span><strong>change</strong><i aria-hidden="true">03</i></div>
              <div><span>Sounds</span><strong>disappear</strong><i aria-hidden="true">04</i></div>
            </div>
          </div>

          <aside aria-labelledby="landing-words-title" className="landing-words-note landing-reveal">
            <div>
              <span className="landing-note-number">Bonus</span>
              <h2 id="landing-words-title">Learn new words along the way.</h2>
            </div>
            <p>Save new words and phrases while you practice. Learning new words is a bonus. The main goal is to hear spoken English clearly.</p>
          </aside>
        </section>

        <section aria-labelledby="landing-final-title" className="landing-final">
          <p>Ready when you are.</p>
          <h2 id="landing-final-title">Start hearing<br />real English.</h2>
          <ButtonLink href="/practice" pill size="lg" variant="primary">Start Listening <ArrowUpRightIcon size={18} /></ButtonLink>
        </section>
      </main>
      <footer className="landing-footer">
        <Link href="/">Unmumble</Link>
        <span>Connected speech trainer</span>
        <span>Listen. Check. Repeat. Hear.</span>
      </footer>
    </>
  );
}
