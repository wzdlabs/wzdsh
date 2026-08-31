import type { WriteStream } from "node:tty";

type Environment = Readonly<Record<string, string | undefined>>;

const reset = "\u001b[0m";

export type TerminalTheme = ReturnType<typeof createTerminalTheme>;

export function createTerminalTheme(
  stream: Pick<WriteStream, "isTTY">,
  environment: Environment = process.env,
) {
  const enabled = environment.NO_COLOR === undefined
    && environment.TERM !== "dumb"
    && (environment.FORCE_COLOR !== undefined ? environment.FORCE_COLOR !== "0" : Boolean(stream.isTTY));

  const color = (code: string) => (value: string) => enabled ? `\u001b[${code}m${value}${reset}` : value;

  return {
    enabled,
    accent: color("38;2;111;143;232"),
    primary: color("38;2;255;255;255"),
    soft: color("38;2;163;163;163"),
    faint: color("38;2;107;107;107"),
    error: color("38;2;255;138;125"),
    bold: color("1"),
  };
}
