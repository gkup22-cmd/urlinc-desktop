import { useInfiniteQuery } from "@tanstack/react-query";
import { listVideos, listPhotos, listMusic } from "./generated/api";
import type { ListVideosParams, ListPhotosParams, ListMusicParams } from "./generated/api.schemas";

export const getInfiniteListVideosQueryKey = (
  params?: Omit<ListVideosParams, "cursor" | "limit">,
) => ["/api/videos", "infinite", params ?? null] as const;

export const getInfiniteListPhotosQueryKey = (
  params?: Omit<ListPhotosParams, "cursor" | "limit">,
) => ["/api/photos", "infinite", params ?? null] as const;

export const getInfiniteListMusicQueryKey = (
  params?: Omit<ListMusicParams, "cursor" | "limit">,
) => ["/api/music", "infinite", params ?? null] as const;

export function useInfiniteListVideos(
  params?: Omit<ListVideosParams, "cursor" | "limit">,
) {
  return useInfiniteQuery({
    queryKey: getInfiniteListVideosQueryKey(params),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      listVideos({ ...params, cursor: pageParam, limit: 200 }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });
}

export function useInfiniteListPhotos(
  params?: Omit<ListPhotosParams, "cursor" | "limit">,
) {
  return useInfiniteQuery({
    queryKey: getInfiniteListPhotosQueryKey(params),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      listPhotos({ ...params, cursor: pageParam, limit: 200 }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });
}

export function useInfiniteListMusic(
  params?: Omit<ListMusicParams, "cursor" | "limit">,
) {
  return useInfiniteQuery({
    queryKey: getInfiniteListMusicQueryKey(params),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      listMusic({ ...params, cursor: pageParam, limit: 200 }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });
}
