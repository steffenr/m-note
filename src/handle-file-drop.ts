interface FileDropAPI {
  getFilePath: (file: File) => string
  readFile: (filePath: string) => Promise<{ path: string; content: string }>
  setFilePath?: (filePath: string) => void | Promise<void>
}

interface FileDropCallbacks {
  setContent: (markdown: string) => void
  setFilePath: (path: string) => void
  setTitle: (name: string) => void
}

export async function handleFileDrop(
  files: FileList,
  electronAPI: FileDropAPI | undefined,
  callbacks: FileDropCallbacks,
): Promise<void> {
  const file = Array.from(files).find((f) => /\.(md|markdown)$/i.test(f.name))
  if (!file) return

  const filePath = electronAPI?.getFilePath(file)

  if (filePath && electronAPI) {
    await electronAPI.readFile(filePath).then(async ({ content }) => {
      callbacks.setContent(content)
      callbacks.setFilePath(filePath)
      callbacks.setTitle(file.name)
      await electronAPI.setFilePath?.(filePath)
    })
  } else {
    await new Promise<void>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        callbacks.setContent(reader.result as string)
        callbacks.setTitle(file.name)
        resolve()
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsText(file)
    })
  }
}
