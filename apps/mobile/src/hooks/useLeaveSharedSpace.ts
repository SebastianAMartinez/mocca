import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export const useLeaveSharedSpace = () => {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	return useMutation(
		trpc.sharedSpace.leave.mutationOptions({
			retry: false,
			onSuccess: async () => {
				const queryKey = trpc.sharedSpace.current.queryKey();
				await queryClient.cancelQueries({ queryKey });
				queryClient.setQueryData(queryKey, () => null);
				await queryClient.invalidateQueries({ queryKey });
			},
		}),
	);
};
