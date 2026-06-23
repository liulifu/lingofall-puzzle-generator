import type { CrosswordDirection, CrosswordPosition } from "./types";

export type DraftCell = CrosswordPosition & {
  solution: string;
  entryIds: string[];
  directions: CrosswordDirection[];
  number?: number;
};

export function positionKey(position: CrosswordPosition): string {
  return `${position.row},${position.col}`;
}

export function parsePositionKey(key: string): CrosswordPosition {
  const [rowText = "0", colText = "0"] = key.split(",");

  return {
    row: Number(rowText),
    col: Number(colText)
  };
}

export function makeEntryCells(
  answer: string,
  start: CrosswordPosition,
  direction: CrosswordDirection
): CrosswordPosition[] {
  return [...answer].map((_, index) =>
    direction === "across" ? { row: start.row, col: start.col + index } : { row: start.row + index, col: start.col }
  );
}

export function nextPosition(position: CrosswordPosition, direction: CrosswordDirection, step: number): CrosswordPosition {
  return direction === "across"
    ? { row: position.row, col: position.col + step }
    : { row: position.row + step, col: position.col };
}

export function perpendicularNeighbors(
  position: CrosswordPosition,
  direction: CrosswordDirection
): [CrosswordPosition, CrosswordPosition] {
  return direction === "across"
    ? [
        { row: position.row - 1, col: position.col },
        { row: position.row + 1, col: position.col }
      ]
    : [
        { row: position.row, col: position.col - 1 },
        { row: position.row, col: position.col + 1 }
      ];
}

export function measureBounds(positions: readonly CrosswordPosition[]): {
  minRow: number;
  minCol: number;
  width: number;
  height: number;
} {
  const minRow = Math.min(...positions.map((position) => position.row));
  const maxRow = Math.max(...positions.map((position) => position.row));
  const minCol = Math.min(...positions.map((position) => position.col));
  const maxCol = Math.max(...positions.map((position) => position.col));

  return {
    minRow,
    minCol,
    width: maxCol - minCol + 1,
    height: maxRow - minRow + 1
  };
}
