export const Introduction = (
  <div>
    {/* Intro */}
    <b>🌲 Welcome to Pine!</b>
    <p>Type a Pine expression above 👆 and interact with your database. See how to navigate 👉</p>
    <br />
    <p>
      <b>🧐 What is a pine expression?</b>
      <br />
      <br />
      The simplest expression is a table name e.g. <code>your_table</code>. Use pipes i.e.{' '}
      <code>|</code> to join the tables.
    </p>
    <br />

    {/* Examples */}
    <b>💡 Examples</b>
    <br />
    <br />
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
    </ul>
    {/* Join  */}
    <b>
      <code>JOIN</code>
    </b>
    {': '}
    <ul>
      <li>
        <code>company | company_document</code>
      </li>
    </ul>

    {/* Limit */}
    <b>
      <code>LIMIT</code>
    </b>
    {': '}
    <ul>
      <li>
        <code>company | limit: 1</code>
      </li>
    </ul>

    {/* Order */}
    <b>
      <code>ORDER</code>
    </b>
    {': '}
    <ul>
      <li>
        <code>company | order: created_at desc</code>
      </li>
    </ul>
  </div>
);
