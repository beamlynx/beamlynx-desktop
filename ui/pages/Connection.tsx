import React from "react";
import { Box } from "@mui/material";

interface Props {}
interface State {
    id: string;
    response: Response;
}

type Response = {
  result: string;
};

class Connection extends React.Component {
  state: State = {
      id: '',
      response: {
          result: '-',
      }
  }
  constructor(props: Props) {
    super(props);
  }

  componentDidMount = async () => {
    const res = await fetch('http://localhost:33333/connection', {
    method: 'GET',
    headers: {
        'Content-Type': 'application/json',
        },
    })
    if (res.status === 200) {
        const response: Response = await res.json();
        this.setState({response});
    }
  }

  render() {
    return (
        <Box sx={{ my: 2}}>
          Connection: {this.state.response.result}
        </Box>
    );
  }
};

export default Connection;