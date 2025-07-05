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
    <b>SELECT</b>
    <span style={{fontSize: '0.9em', color: '#666'}}> <code>select:</code> <code>s:</code></span>
    <ul>
      <li>
        <code>company</code>
      </li>
      <li>
        <code>company | select: id, name</code>
      </li>
    </ul>

    {/* Where */}
    <b>WHERE</b>
    <span style={{fontSize: '0.9em', color: '#666'}}> <code>where:</code> <code>w:</code></span>
    <ul>
      <li>
        <code>company | where: name = &apos;Acme&apos;</code>
      </li>
      <li>
        <code>company | where: active = true</code>
      </li>
    </ul>

    {/* Limit */}
    <b>LIMIT</b>
    <span style={{fontSize: '0.9em', color: '#666'}}> <code>limit:</code> <code>l:</code> <code>number</code></span>
    <ul>
      <li>
        <code>company | limit: 24</code>
      </li>
      <li>
        <code>company | 24</code>
      </li>
    </ul>

    {/* Order */}
    <b>ORDER</b>
    <span style={{fontSize: '0.9em', color: '#666'}}> <code>order:</code> <code>o:</code></span>
    <ul>
      <li>
        <code>company | order: created_at desc</code>
      </li>
    </ul>

    {/* Join  */}
    <b>JOIN</b>
    <span style={{fontSize: '0.9em', color: '#666'}}> <code>table_name</code></span>
    <ul>
      <li>
        <code>company | company_document</code>
      </li>
    </ul>
  </div>
);
