import React from "react";

import TextField from '@mui/material/TextField';
import { Box } from "@mui/material";

interface Props {}
interface State {
    expression: string;
    response: Response;
}

type Response = {
  'connection-id': string;
  query: string;
};

class PineExpression extends React.Component {
  state: State = {
      expression: '',
      response: {
        'connection-id': '',
        'query': '',
      }
  }
  constructor(props: Props) {
    super(props);
  }

  handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({expression: e.target.value});
    console.log('Value: ' + this.state.expression) ;
  } 

  handleEnter = async (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter') {
        return;
      }
      console.log('Enter pressed')
      const res = await fetch('http://localhost:33333/build', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expression: this.state.expression
        })})
      if (res.status === 200) {

        const response: Response = await res.json();
        this.setState({response});
      }
  }

  render() {
    return (
        <Box sx={{ my: 2}}>
            <TextField autoFocus variant='outlined' fullWidth onChange={this.handleChange} onKeyDown={this.handleEnter}></TextField>
            <br />
            <br />
            Expression: {this.state.expression}
            <br />
            <br />
            {this.state.response["connection-id"]}
            <TextField multiline fullWidth value={ this.state.response.query }></TextField>
        </Box>
    );
  }
};

export default PineExpression;