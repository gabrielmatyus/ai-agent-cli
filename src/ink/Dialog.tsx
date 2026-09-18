import { Box, Text } from 'ink'

function Button({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Box
      marginRight={1}
      borderStyle="round"
      borderColor={focused ? 'green' : 'gray'}
      backgroundColor={focused ? 'green' : undefined}
      paddingX={1}
    >
      <Text color={focused ? 'black' : 'white'} bold={focused}>
        {focused ? `[${label}]` : ` ${label} `}
      </Text>
    </Box>
  )
}

export function ConfirmDialog({
  title,
  description,
  choice
}: {
  title: string
  description: string
  choice: boolean
}) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      backgroundColor="#111111"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="yellow">
        {title}
      </Text>
      <Box marginTop={1} width={60}>
        <Text wrap="wrap">{description}</Text>
      </Box>
      <Box flexDirection="row" marginTop={1}>
        <Button label="Allow" focused={choice === true} />
        <Button label="Deny" focused={choice === false} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>←/→ move · Enter confirm · Esc deny</Text>
      </Box>
    </Box>
  )
}
