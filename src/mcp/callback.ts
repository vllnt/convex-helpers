/** Bound host policy callbacks; timeout does not cancel host-owned work. */
export async function policyCallback<T>(
  callback: () => Promise<T> | T,
): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(callback),
      new Promise<never>((_, reject) => {
        handle = setTimeout(() => {
          reject(new Error("Policy callback timed out"));
        }, 10_000);
      }),
    ]);
  } finally {
    clearTimeout(handle);
  }
}
