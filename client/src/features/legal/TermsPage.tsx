import { Link } from 'react-router-dom';
import { LegalLayout, Section } from '@/features/legal/LegalLayout';

/**
 * Terms of service.
 *
 * Deliberately shaped around a campus deployment rather than a consumer product:
 * the operator is the institution, the user is a student subject to that
 * institution's conduct code, and the sanctions available are institutional ones.
 * The clauses that would be boilerplate elsewhere — arbitration, liability caps,
 * content licensing for commercial use — are either absent or narrowed, because
 * they do not describe what is happening here.
 */
export function TermsPage() {
  return (
    <LegalLayout
      title="Terms of service"
      subtitle="The rules for using this campus community, and what happens when they are broken."
    >
      <Section n="1" title="What this is and who may use it">
        <p>
          CampusConnect is operated by your institution for its own community. Accounts are limited
          to email addresses on the domains your administrators have approved, and administrators
          may close registration entirely.
        </p>
        <p>
          One account per person. Do not share your account, sign in as someone else, or create an
          account for somebody who is not entitled to one. Your account and what happens under it
          are your responsibility.
        </p>
        <p>
          Using this app does not replace or override your institution&rsquo;s student conduct code,
          academic integrity policy, IT acceptable-use policy, or any employment terms if you are
          staff. Where those and these differ, those govern.
        </p>
      </Section>

      <Section n="2" title="Academic integrity comes first">
        <p>
          This app is built to share course knowledge, and that makes it easy to cross a line your
          institution takes seriously. The following is not permitted here:
        </p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            Uploading current assignments, quizzes, exams or their solutions while that assessment
            is still live.
          </li>
          <li>
            Posting material your instructor has restricted from redistribution — lecture
            recordings, slide decks, or question banks that carry a licence or a stated prohibition.
          </li>
          <li>Requesting or supplying answers to work that is meant to be done individually.</li>
          <li>Arranging for someone else to complete work that will be submitted as your own.</li>
        </ul>
        <p>
          Past exams, your own notes, study guides and honest advice about a course are exactly what
          the resource libraries are for. If you are unsure which side of the line something falls
          on, ask the instructor before you post it — the app cannot make that judgement for you,
          and neither can a moderator after the fact.
        </p>
        <p>
          Course reviews should describe your genuine experience of a course. Reviews are one per
          person per term for that reason.
        </p>
      </Section>

      <Section n="3" title="How to behave">
        <p>Do not use this app to:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            Harass, threaten, stalk or intimidate anyone, or coordinate others to do so. This
            applies in anonymous channels exactly as it applies everywhere else.
          </li>
          <li>
            Post hateful content targeting people for who they are, including their race, ethnicity,
            religion, disability, gender, gender identity or sexual orientation.
          </li>
          <li>
            Share someone&rsquo;s personal information, images or messages without their consent.
          </li>
          <li>
            Post sexual content, or anything sexual involving a minor under any circumstances.
          </li>
          <li>
            Impersonate another student, a staff member, a club, or the institution — including
            through display names, profile pictures and nicknames.
          </li>
          <li>
            Distribute malware, phishing links, or attempt to gain access to accounts or systems.
          </li>
          <li>
            Spam, mass-message, scrape the directory, or automate activity to game karma or badges.
          </li>
        </ul>
        <p>
          Anonymous channels exist so people can ask the awkward question. They are not a shield.
          Your account is recorded against every anonymous post and administrators can look it up —
          see the{' '}
          <Link to="/privacy" className="text-accent-lift hover:underline">
            privacy policy
          </Link>
          .
        </p>
      </Section>

      <Section n="4" title="What you post">
        <p>
          You keep ownership of everything you write and upload. By posting it here you give your
          institution permission to store it, display it to the people this app shows it to, and
          keep it available across terms — which is the whole point of a resource library that
          outlasts a semester.
        </p>
        <p>
          That permission covers running this service and nothing else. Your institution does not
          get the right to sell your content, license it onward, or use it in marketing by virtue of
          these terms.
        </p>
        <p>
          Only upload what you have the right to upload. If you post something that infringes
          somebody&rsquo;s copyright, it will be removed on request. Repeated infringement is
          grounds for losing your account.
        </p>
        <p>
          Content stays after you leave. Closing an account anonymises it rather than erasing what
          you wrote, so that other people&rsquo;s conversations remain readable.
        </p>
      </Section>

      <Section n="5" title="Spaces, clubs and the people who run them">
        <p>
          Anyone may start a space, if administrators have enabled that. Whoever creates a space
          owns it: they set its channels, decide who is in it, and can hand out roles or delete the
          space entirely.
        </p>
        <p>
          Owning a space means being responsible for what happens in it. Owners and moderators are
          expected to act on harassment in their own space rather than waiting for a campus
          administrator to notice. A space that becomes a vehicle for the behaviour in section 3 can
          be removed, and the people running it can lose their accounts.
        </p>
        <p>
          Administrators may create spaces for clubs and hand them to a student owner. A space
          created that way is invisible to everyone until it has an owner.
        </p>
        <p>
          Do not use a space to represent an official institutional body you have no authority to
          speak for.
        </p>
      </Section>

      <Section n="6" title="Voice calls">
        <p>
          Voice is peer-to-peer: the audio goes directly between browsers and is not recorded by
          this app. That also means the people on a call can see each other&rsquo;s network
          addresses. Join calls with people you are willing to be connected to directly.
        </p>
        <p>
          Do not record a call without telling the people on it. Depending on where you are, doing
          so may be illegal as well as against these terms.
        </p>
      </Section>

      <Section n="7" title="Marketplace, lost and found, and mentoring">
        <p>
          <strong className="text-chalk">No money moves through this app.</strong> The marketplace
          is a noticeboard. Your institution is not a party to any sale, does not verify listings,
          does not hold funds, and will not arbitrate a disagreement between a buyer and a seller.
          Meet somewhere public on campus and use your judgement.
        </p>
        <p>
          Do not list anything you cannot lawfully sell, anything the institution prohibits on its
          property, or anything you do not actually have. Do not use lost and found to claim
          property that is not yours.
        </p>
        <p>
          Mentoring connections are between students. Nobody here is vetted, credentialed or
          supervised by the institution simply for appearing as a mentor.
        </p>
      </Section>

      <Section n="8" title="Reporting and enforcement">
        <p>
          Messages, users, resources, listings, reviews and events can all be reported. Reports go
          to space moderators and campus administrators.
        </p>
        <p>What can happen, roughly in order of severity:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>Content removed by a space moderator or an administrator.</li>
          <li>A warning, a timed mute, or removal from a space.</li>
          <li>Your account suspended, which ends every active session immediately.</li>
          <li>
            Referral to your institution&rsquo;s student conduct process, where the consequences are
            theirs to decide and are not limited to this app.
          </li>
        </ul>
        <p>
          Serious matters — threats, sexual content involving minors, credible risk of harm — will
          be escalated to campus security or law enforcement, and nothing in these terms restricts
          your institution from doing that.
        </p>
        <p>
          Do not file reports in bad faith. Reports are rate-limited, and using the report button as
          a weapon is itself a conduct issue.
        </p>
      </Section>

      <Section n="9" title="Rate limits and fair use">
        <p>
          To keep the app usable there are limits: twenty messages a minute, five anonymous posts an
          hour, a hundred uploads a day, three reports an hour, and eight people in a voice room.
          Files are capped at ten megabytes.
        </p>
        <p>
          Do not attempt to work around these, run automated clients against the app, or probe it
          for vulnerabilities without your IT department&rsquo;s written permission. If you find a
          security problem, report it to them rather than demonstrating it.
        </p>
      </Section>

      <Section n="10" title="Availability, and the absence of guarantees">
        <p>
          This service is provided as-is. It may be unavailable, lose data, or be discontinued.
          There is no uptime commitment, and it is not a system of record for anything — not your
          grades, not your enrolment, not your course history. The course information here is what
          students typed in, not what the registrar holds.
        </p>
        <p>
          Keep your own copy of anything you would be upset to lose. Do not rely on a direct message
          in this app to reach someone urgently.
        </p>
        <p>
          To the fullest extent the law where you are allows, your institution is not liable for
          indirect or consequential loss arising from your use of this service. Nothing here limits
          liability that cannot lawfully be limited.
        </p>
      </Section>

      <Section n="11" title="Ending your access">
        <p>
          You may stop using the app and ask your campus IT team to close your account at any time.
          Closing it anonymises your profile; what you posted stays, as described in section 4.
        </p>
        <p>
          Your institution may suspend or close an account for breaching these terms, for breaching
          its own policies, or when you are no longer part of the community it serves.
        </p>
      </Section>

      <Section n="12" title="Governing terms">
        <p>
          These terms are governed by the law of the jurisdiction in which your institution
          operates, and disputes belong to the courts of that jurisdiction. There is no arbitration
          clause and no waiver of class action here — this is a campus service, not a consumer
          product, and your institution&rsquo;s existing grievance procedures apply first.
        </p>
        <p>
          If any part of these terms is unenforceable, the rest still stands. Your institution may
          update these terms; material changes should be communicated to students rather than
          quietly published.
        </p>
      </Section>
    </LegalLayout>
  );
}
