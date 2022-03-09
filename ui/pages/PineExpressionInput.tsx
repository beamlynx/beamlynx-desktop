import React from "react";

import TextField from '@mui/material/TextField';
import { Box } from "@mui/material";

interface Props {}
interface State {
    value: string;
}

class PineExpressionInput extends React.Component {
  state: State = {
      value: '',
  }
  constructor(props: Props) {
    super(props);
    this.state = {value: ''};
  }

  handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({value: e.target.value});
    console.log('Value: ' + this.state.value)
  }

  handleEnter = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
          console.log('Enter pressed')
      }
  }

  render() {
    return (
        <Box sx={{ my: 2}}>
            <TextField autoFocus variant='outlined' fullWidth onChange={this.handleChange} onKeyDown={this.handleEnter}></TextField>
        </Box>
    );
  }
};

export default PineExpressionInput;