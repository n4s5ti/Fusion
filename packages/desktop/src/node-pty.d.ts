declare module "node-pty" {
  export interface IPty {
    [key: string]: any;
  }
  export interface IPtyForkOptions {
    [key: string]: any;
  }
  export interface IWindowsPtyForkOptions extends IPtyForkOptions {
    [key: string]: any;
  }
  export function spawn(...args: any[]): IPty;
}
