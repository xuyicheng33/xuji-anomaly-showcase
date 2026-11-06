import { Component, type ReactNode } from 'react';
import DataFailure from './DataFailure';

/** One boundary for unexpected render errors; data reads keep their own retry. */
export default class ReportFailure extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? (
      <DataFailure message="页面显示失败，重新读取。" retry={() => location.reload()} />
    ) : (
      this.props.children
    );
  }
}
