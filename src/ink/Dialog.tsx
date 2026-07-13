import { Box, Text } from 'ink'

export function Dialog({title, children}: {title: string, children: string}) {
  return (
    <Box
      borderStyle="round"
      borderColor="cyan"
      flexDirection="column"
      paddingX={1}
      paddingY={1}
      width={50}
    >
      <Text bold>{title}</Text>

      <Box marginTop={1}>
        <Text>{children}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color="green">[Enter] OK</Text>
      </Box>
    </Box>
  );
}