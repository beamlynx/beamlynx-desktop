import React from "react";
import ActiveConnection from "./components/ActiveConnection";

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
    // const { connectionStore } = useStores();
    // await connectionStore.getDefaultConnection();

    // const res = await fetch('http://localhost:33333/connection', {
    // method: 'GET',
    // headers: {
    //     'Content-Type': 'application/json',
    //     },
    // })
    // if (res.status === 200) {
    //     const response: Response = await res.json();
    //     this.setState({response});
    // }
  }

  render() {

    return (
        <ActiveConnection />
    );
  }
};

export default Connection;