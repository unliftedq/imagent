declare module "nodejieba" {
  const nodejieba: {
    cutForSearch(input: string): string[];
  };
  export default nodejieba;
}
