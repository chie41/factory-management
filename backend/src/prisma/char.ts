
export function char<N extends number>(
    value: string,
    length: N,
  ): string & {
    readonly __charLength: N;
  } {
    if (value.length !== length) {
      throw new Error(
        `Giá trị CHAR(${length}) phải có đúng ${length} ký tự`,
      );
    }
  
    return value as string & {
      readonly __charLength: N;
    };
  }
  