export const Introduction = (
  <div>
    {/* Intro */}
    <b>🌲 Welcome to Pine!</b>
    <br />
    <p>
      Start by typing the name of a table (e.g. <code>company</code>, <code>document</code>).
    </p>
    <p>
      Use pipes (<code>|</code>) to compose queries. See examples:
    </p>

    {/* Select  */}
    <b>
      <code>SELECT</code>
    </b>
    <ul>
      <li>
        <code>company</code>
      </li>
      <li>
        <code>company | select: id, name</code>
      </li>
      <li>
        <code>company | s: id, name</code>
      </li>
    </ul>

    {/* Where */}
    <b>
      <code>WHERE</code>
    </b>
    <ul>
      <li>
        <code>company | where: name = &apos;Acme&apos;</code>
      </li>
      <li>
        <code>company | w: name = &apos;Acme&apos;</code>
      </li>
      <li>
        <code>company | w: active = true</code>
      </li>
    </ul>

    {/* Limit */}
    <b>
      <code>LIMIT</code>
    </b>
    <ul>
      <li>
        <code>company | limit: 24</code>
      </li>
      <li>
        <code>company | l: 24</code>
      </li>
      <li>
        <code>company | 24</code>
      </li>
    </ul>

    {/* Order */}
    <b>
      <code>ORDER</code>
    </b>
    <ul>
      <li>
        <code>company | order: created_at desc</code>
      </li>
      <li>
        <code>company | o: created_at desc</code>
      </li>
    </ul>

    {/* Join  */}
    <b>
      <code>JOIN</code>
    </b>
    <ul>
      <li>
        <code>company | company_document</code>
      </li>
    </ul>
  </div>
);
