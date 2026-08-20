import { DataNote, LegalLayout, Section } from '@/features/legal/LegalLayout';

/**
 * Privacy policy.
 *
 * Written against convex/schema.ts rather than from a template. Every claim about
 * what is stored corresponds to a table, and the tables are named, because a
 * privacy policy that describes a system nobody checked against is worse than none:
 * it is a promise the code has not agreed to.
 *
 * Four disclosures here are the ones that actually matter, and they are the ones a
 * generic policy would leave out:
 *
 *   - anonymous posts are pseudonymous, not anonymous, and administrators can
 *     unmask them;
 *   - voice calls are peer-to-peer, which exposes IP addresses between callers;
 *   - the deployment runs on a third-party cloud, so data leaves campus;
 *   - deletion anonymises rather than erases.
 */
export function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy policy"
      subtitle="What this app stores about you, who can see it, and what happens when you leave."
    >
      <Section n="1" title="Who runs this">
        <p>
          This is a self-hosted deployment of CampusConnect operated by your institution&rsquo;s IT
          department, not by a commercial social network. One deployment serves one campus. Your
          institution decides who may register, who administers it, and how long it runs.
        </p>
        <p>
          The application data is stored on <strong className="text-chalk">Convex</strong>, a
          third-party hosted database and function platform. That means your information leaves
          campus infrastructure and rests with that provider under their security and retention
          terms, in whichever region the deployment was created. Your institution should confirm
          this arrangement satisfies its own data-residency and vendor-review requirements before
          asking students to use it.
        </p>
      </Section>

      <Section n="2" title="What you give us directly">
        <p>
          <strong className="text-chalk">Account.</strong> Your email address, a username, a display
          name, and a password. The password is never stored — only a PBKDF2-SHA512 derivation of it
          with a per-account salt, which cannot be reversed back into your password.
        </p>
        <p>
          <strong className="text-chalk">Profile.</strong> Anything you choose to add: a picture,
          bio, pronouns, year of study, major and minor. All of it is optional except your name and
          email, and your privacy settings control who sees the rest.
        </p>
        <p>
          <strong className="text-chalk">Academic details you enter yourself.</strong> The courses
          you list, the term, and whether you are taking, have taken, or plan to take them. This
          comes from you, not from the registrar — the app has no connection to student records and
          cannot verify or contradict them.
        </p>
        <p>
          <strong className="text-chalk">Things you post.</strong> Messages, direct messages, thread
          replies, reactions, course reviews, uploaded resources, questions and answers, marketplace
          listings and their photos, lost-and-found reports, study-group descriptions, your weekly
          availability grid, and event RSVPs.
        </p>
        <DataNote>
          users · userInterests · userCourses · messages · directMessages · reactions ·
          courseReviews · resources · qaPosts · qaAnswers · marketplaceListings · lostFoundItems ·
          studyGroups · buddyProfiles · eventRsvps
        </DataNote>
      </Section>

      <Section n="3" title="What the app records as you use it">
        <p>
          <strong className="text-chalk">Presence.</strong> Your browser reports that you are active
          roughly every twenty seconds. Anyone who can see you counts you as online if that was
          within the last forty-five seconds. It also records which channel you are typing in, so
          typing indicators work, and that record expires after about six seconds.
        </p>
        <p>
          <strong className="text-chalk">Read positions.</strong> The last time you opened each
          channel and conversation, which is how unread badges know what to show. This is visible
          only to you.
        </p>
        <p>
          <strong className="text-chalk">Sessions.</strong> A random token per sign-in, valid for
          thirty days. It is held in your browser&rsquo;s local storage and sent with each request.
          Signing out deletes it. Changing your password deletes every other session on the account.
        </p>
        <p>
          <strong className="text-chalk">Rate-limit counters.</strong> Short-lived counts of how
          many messages, anonymous posts, uploads and reports you have made in the current window.
        </p>
        <p>
          The app does not use advertising trackers, third-party analytics, or cookies for
          profiling. There is no advertising here and nothing is sold.
        </p>
        <DataNote>
          presence · channelReads · directMembers.lastReadAt · sessions · rateLimits
        </DataNote>
      </Section>

      <Section n="4" title="Anonymous channels are pseudonymous, not anonymous">
        <p>
          Posts in anonymous channels appear under a stable animal alias — the same alias for you in
          the same channel every time, so conversations stay followable. Other students cannot see
          who you are, and the app never sends your identity to anyone else&rsquo;s browser
          alongside an anonymous post.
        </p>
        <p>
          <strong className="text-chalk">
            Your account is still recorded against the post on the server.
          </strong>{' '}
          It has to be, so that harassment and threats in those channels can be acted on. Campus
          administrators can look it up. When they do, that lookup is itself written to the
          moderation record, so unmasking is not a silent capability.
        </p>
        <p>
          Treat anonymous channels as protection from your classmates, not from your institution. If
          you would not want it traced to you at all, do not post it here.
        </p>
        <DataNote>
          messages.authorId (retained, never serialised when isAnonymous) · moderationActions
        </DataNote>
      </Section>

      <Section n="5" title="Voice calls expose your IP address to the people on the call">
        <p>
          Voice runs peer-to-peer over WebRTC. The audio travels directly between the browsers on
          the call and never passes through the campus server, which is why calls are not recorded
          and cannot be — there is nothing in the middle to record them.
        </p>
        <p>
          The trade for that is real and worth understanding:{' '}
          <strong className="text-chalk">
            establishing a direct connection means each participant&rsquo;s network address is
            visible to the others.
          </strong>{' '}
          This is inherent to peer-to-peer calling and is true of every application that works this
          way. If that matters to you, do not join voice calls with people you do not trust.
        </p>
        <p>
          To find a route between two browsers, the app contacts a public STUN server — by default
          one operated by Google, configurable by your administrators. That server sees the network
          address it is asked about. It does not see, and cannot see, any audio.
        </p>
        <p>
          While a call is in progress the server stores who is in the room, whether they are muted,
          and short-lived connection-negotiation messages that are deleted as soon as the other
          browser reads them. When you leave, your row is deleted.
        </p>
        <DataNote>voiceParticipants · voiceSignals (deleted on consumption)</DataNote>
      </Section>

      <Section n="6" title="Who can see what">
        <p>
          <strong className="text-chalk">Other students</strong> see your profile according to your
          privacy settings, your posts in spaces you share, and your name in the member lists of
          those spaces. Turning off discoverability removes you from classmate grids and buddy
          matching. Your email address is never shown to other students.
        </p>
        <p>
          <strong className="text-chalk">Space owners and moderators</strong> see everything posted
          in their space, including deleted messages&rsquo; existence, and can remove people from
          it.
        </p>
        <p>
          <strong className="text-chalk">Campus administrators</strong> can see and edit every
          account: name, username, email, year, major, bio, pronouns and karma. They can suspend an
          account, remove a profile picture, and issue a password reset code.
        </p>
        <p>
          <strong className="text-chalk">Administrators cannot read your password</strong> — nobody
          can, including them, because it is not stored. They cannot set one either. Resetting means
          issuing you a one-time code that you redeem yourself. They also cannot replace your
          profile picture, only remove it.
        </p>
        <p>
          <strong className="text-chalk">
            Direct messages are not shown in the admin dashboard.
          </strong>{' '}
          They are, however, stored in the same database as everything else and are not end-to-end
          encrypted. Anyone with direct database access — which for this deployment means your
          institution&rsquo;s administrators and the hosting provider — could read them. Do not use
          this app for anything that needs genuine confidentiality.
        </p>
      </Section>

      <Section n="7" title="What administrators do is logged">
        <p>
          Creating and deleting spaces, editing accounts, granting or revoking administrator access,
          suspending accounts, removing pictures, issuing password resets, adding majors, and
          changing instance settings are all written to an append-only activity log, with who did it
          and when.
        </p>
        <p>
          Entries cannot be edited or deleted through the application, including by the
          administrator who created them. This is deliberate: a log an administrator can edit is not
          an accountability record.
        </p>
        <DataNote>auditLogs (append-only)</DataNote>
      </Section>

      <Section n="8" title="Retention, and what deletion actually means">
        <p>
          Course reviews, resources, questions and answers are meant to outlive the term they were
          written in — that persistence is the point of the app. Expect them to remain visible,
          labelled with their term, indefinitely.
        </p>
        <p>
          <strong className="text-chalk">
            Closing an account anonymises it rather than erasing it.
          </strong>{' '}
          Your name becomes a generic placeholder and your profile empties, but your messages stay
          where they are so that other people&rsquo;s conversations remain readable. A thread with
          half its replies missing is not a record anyone can use.
        </p>
        <p>
          Deleted messages are soft-deleted: the text is cleared and the row is kept, so that
          moderators can still trace an anonymous post that was deleted after it was reported.
        </p>
        <p>
          Deleting a space is a genuine deletion — its channels, messages, pins, roles and
          memberships are removed permanently and cannot be recovered.
        </p>
        <p>
          If you want your content actually removed rather than anonymised, ask your campus IT team.
          Whether they must comply depends on the privacy law your institution operates under, which
          this document does not attempt to state for you.
        </p>
      </Section>

      <Section n="9" title="Security, honestly stated">
        <p>
          Passwords are hashed with PBKDF2-SHA512 at 210,000 iterations with a per-account salt.
          Uploaded files are stored by the hosting provider and served over HTTPS.
        </p>
        <p>
          <strong className="text-chalk">One known weakness you should know about:</strong> session
          tokens are held in browser local storage rather than in an HTTP-only cookie, because the
          platform this runs on does not provide a cookie mechanism for its function calls. A
          cross-site scripting flaw in this app would therefore be enough to take over an account.
          The app avoids rendering untrusted HTML, but the risk is structural rather than
          eliminated, and moving to a dedicated authentication provider is the real fix.
        </p>
      </Section>

      <Section n="10" title="Children and eligibility">
        <p>
          This deployment is intended for enrolled students, staff and alumni of the operating
          institution, gated by email domain. It is not designed or intended for children, and it is
          not a service anyone under the age at which your jurisdiction requires parental consent
          for online services should be signed up to.
        </p>
      </Section>

      <Section n="11" title="Changes">
        <p>
          Administrators can change instance settings, including which email domains may register
          and whether registration is open at all, and those changes take effect immediately. If
          this policy itself changes materially, your institution should tell students rather than
          relying on them re-reading this page.
        </p>
      </Section>
    </LegalLayout>
  );
}
