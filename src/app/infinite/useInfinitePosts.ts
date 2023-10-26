import { type RouterOutputs, api } from "#src/hooks/api";
import { useIntersectionObserver } from "#src/hooks/useIntersectionObserver";

export function useInfinitePosts(initialData: RouterOutputs["post"]["infinitePosts"]) {
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } = api.post.infinitePosts.useInfiniteQuery(
    {},
    {
      initialData: { pages: [initialData], pageParams: [] },
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );
  //const infinitePosts = useMemo(() => data?.pages.map((page) => page.items).flat() ?? [], [data]);

  const refFetchNextPage = useIntersectionObserver<HTMLDivElement>(([entry]) => {
    const isVisible = !!entry?.isIntersecting;
    if (isVisible && hasNextPage !== false) {
      fetchNextPage()
        .then(() => void {})
        .catch(() => void {});
    }
  });

  return { data, refFetchNextPage, isFetchingNextPage, hasNextPage };
}
