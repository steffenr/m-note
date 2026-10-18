import { useEffect, useRef, useState } from 'react'
import { mount } from 'pele'
import './mermaid-preview.scss'

export function MermaidPreview({ source }: { source: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const diagramRef = useRef<ReturnType<typeof mount> | null>(null)
  const [failed, setFailed] = useState(false)
  const empty = !source.trim()

  useEffect(() => () => {
    diagramRef.current?.destroy()
    diagramRef.current = null
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (empty) {
      diagramRef.current?.destroy()
      diagramRef.current = null
      container.replaceChildren()
      setFailed(false)
      return
    }
    const timer = setTimeout(() => {
      try {
        if (diagramRef.current) {
          diagramRef.current.update(source)
        } else {
          diagramRef.current = mount(container, source, {
            links: false,
            images: false,
            autoDirection: false,
            zoom: false,
            onError: () => setFailed(true),
            onRender: () => setFailed(false),
          })
        }
        setFailed(Boolean(diagramRef.current.error))
      } catch {
        setFailed(true)
      }
    }, 150)
    return () => clearTimeout(timer)
  }, [source, empty])

  return (
    <div className="mermaid-preview" contentEditable={false} aria-label="Mermaid diagram preview">
      {empty && <p className="mermaid-preview-message">Enter Mermaid syntax to preview a diagram.</p>}
      <div ref={containerRef} className="mermaid-preview-canvas" />
      {failed && <p className="mermaid-preview-error" role="status">Preview could not be updated. Any diagram shown is from the last valid source.</p>}
    </div>
  )
}
