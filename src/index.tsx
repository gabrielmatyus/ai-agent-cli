#!/usr/bin/env node
import { render } from 'ink'
import App from './ink/App.js'

async function main() {
  const { waitUntilExit } = render(<App />, 
      {
        //   alternateScreen: true,
        //   incrementalRendering: true
      }
  )
  await waitUntilExit()
}

main()
