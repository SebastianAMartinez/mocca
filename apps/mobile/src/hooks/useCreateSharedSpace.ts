import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export const useCreateSharedSpace = () => {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	return useMutation(
		trpc.sharedSpace.create.mutationOptions({
			retry: false,
			onSuccess: async ({ sharedSpace }) => {
				const queryKey = trpc.sharedSpace.current.queryKey();
				await queryClient.cancelQueries({ queryKey });
				queryClient.setQueryData(queryKey, () => ({
					sharedSpace,
					partner: null,
				}));
				await queryClient.invalidateQueries({ queryKey });
			},
			onError: async (error) => {
				if (error.data?.code === "CONFLICT") {
					await queryClient.invalidateQueries({
						queryKey: trpc.sharedSpace.current.queryKey(),
					});
				}
			},
		}),
	);
};
