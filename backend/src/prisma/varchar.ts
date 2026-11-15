export function varchar<N extends number>(
    value: string,
    maxLength: N,
  ): string & { readonly __varcharLength: N } {
    if (value.length > maxLength) {
      throw new Error(
        `Giá trị vượt quá giới hạn ${maxLength} ký tự`,
      );
    }
  
    return value as string & {
      readonly __varcharLength: N;
    };
  }