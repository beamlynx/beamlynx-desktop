export const Introduction = (

  <div>
    {/* Intro */}
    <b>Welcome to <span style={{color: '#4a9eff'}}>beamlynx</span></b>
    <br />
    <p>
      Beamlynx uses <a href="https://beamlynx.com/docs" style={{textDecoration: 'underline'}}>pine-lang</a> dsl to query data.
    </p>

    <p>Examples:</p>
    
    <ul>
      <li>
        <code style={{
          fontFamily: 'monospace',
        }}>customers | select: first_name</code>
      </li>

      <li>
        <code style={{
          fontFamily: 'monospace',
        }}>customers | where: first_name = &apos;John&apos;</code>
      </li>

      <li>
        <code style={{
          fontFamily: 'monospace',
        }}>customers
| orders 
| select: name, price
| limit: 10</code>
      </li>
    </ul>

  </div>
);
