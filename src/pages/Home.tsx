import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Search,
  Upload,
  FileText,
  X,
  Send,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Copy,
  CheckCircle,
  AlertCircle,
  Trash2,
  Database,
  BookOpen,
} from 'lucide-react'
import { callAIAgent, uploadFiles, ingestFilesToRAG } from '@/utils/aiAgent'
import type { NormalizedAgentResponse } from '@/utils/aiAgent'
import { cn } from '@/lib/utils'

// Agent configuration
const AGENT_ID = '6964a295ee6d749fb303a7b7'
const RAG_ID = '6964a281ee189869130613de'

// TypeScript interfaces from actual_test_response
interface SourceCitation {
  citation_number: number
  document_name: string
  page_number: number
  excerpt: string
}

interface KnowledgeSearchResult {
  answer: string
  sources: SourceCitation[]
  confidence: number
  related_questions: string[]
}

interface KnowledgeSearchResponse extends NormalizedAgentResponse {
  result: KnowledgeSearchResult
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  response?: KnowledgeSearchResult
}

interface UploadedDocument {
  id: string
  name: string
  size: number
  uploadDate: Date
  status: 'uploading' | 'success' | 'error'
  asset_id?: string
  error?: string
}

// Sub-components defined outside to prevent re-creation
function WelcomeState({ onSuggestedQuery }: { onSuggestedQuery: (query: string) => void }) {
  const suggestions = [
    'What are the key findings in the uploaded documents?',
    'Summarize the main topics covered',
    'What recommendations are mentioned?',
    'Compare different approaches discussed',
  ]

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-2xl">
        <div className="mb-6 inline-flex items-center justify-center w-20 h-20 rounded-full bg-indigo-500/10">
          <BookOpen className="w-10 h-10 text-indigo-500" />
        </div>
        <h2 className="text-3xl font-bold text-white mb-3">Knowledge Search</h2>
        <p className="text-gray-400 mb-8">
          Upload PDF documents and ask questions to get accurate answers with source citations
        </p>
        <div className="space-y-3">
          <p className="text-sm text-gray-500 mb-4">Try asking:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {suggestions.map((query, i) => (
              <button
                key={i}
                onClick={() => onSuggestedQuery(query)}
                className="px-4 py-3 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700 rounded-lg text-sm text-gray-300 text-left transition-colors"
              >
                {query}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyDocumentsState() {
  return (
    <div className="flex-1 flex items-center justify-center p-8 text-center">
      <div className="max-w-md">
        <Database className="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <p className="text-gray-500 text-sm">No documents uploaded yet</p>
        <p className="text-gray-600 text-xs mt-2">
          Upload PDF documents to start searching
        </p>
      </div>
    </div>
  )
}

function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end mb-4">
      <div className="max-w-[80%] bg-indigo-600 text-white px-4 py-3 rounded-2xl rounded-tr-sm">
        <p className="text-sm">{content}</p>
      </div>
    </div>
  )
}

function AssistantMessage({
  response,
  onCopy,
  onQuestionClick,
}: {
  response: KnowledgeSearchResult
  onCopy: (text: string) => void
  onQuestionClick: (question: string) => void
}) {
  const [copiedAnswer, setCopiedAnswer] = useState(false)

  const handleCopyAnswer = () => {
    onCopy(response.answer)
    setCopiedAnswer(true)
    setTimeout(() => setCopiedAnswer(false), 2000)
  }

  // Parse inline citations [1], [2], etc. and make them interactive
  const renderAnswerWithCitations = (text: string) => {
    const parts = text.split(/(\[\d+\])/g)
    return parts.map((part, i) => {
      const match = part.match(/\[(\d+)\]/)
      if (match) {
        const citationNum = parseInt(match[1])
        const source = response.sources.find((s) => s.citation_number === citationNum)
        if (source) {
          return (
            <span
              key={i}
              className="inline-flex items-center justify-center w-5 h-5 text-xs bg-indigo-500/20 text-indigo-400 rounded cursor-pointer hover:bg-indigo-500/30 mx-0.5"
              title={`${source.document_name} - Page ${source.page_number}`}
            >
              {citationNum}
            </span>
          )
        }
      }
      return <span key={i}>{part}</span>
    })
  }

  return (
    <div className="flex justify-start mb-6">
      <div className="max-w-[85%]">
        <Card className="bg-gray-800/50 border-gray-700">
          <CardContent className="p-4">
            {/* Answer */}
            <div className="mb-4">
              <p className="text-gray-200 leading-relaxed">
                {renderAnswerWithCitations(response.answer)}
              </p>
            </div>

            {/* Confidence indicator */}
            {response.confidence > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-500">Confidence</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs',
                      response.confidence >= 0.7 ? 'border-green-500 text-green-400' : '',
                      response.confidence >= 0.4 && response.confidence < 0.7
                        ? 'border-yellow-500 text-yellow-400'
                        : '',
                      response.confidence < 0.4 ? 'border-orange-500 text-orange-400' : ''
                    )}
                  >
                    {Math.round(response.confidence * 100)}%
                  </Badge>
                </div>
                <Progress value={response.confidence * 100} className="h-1" />
              </div>
            )}

            {/* Sources */}
            {response.sources.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">Sources</p>
                <div className="space-y-2">
                  {response.sources.map((source) => (
                    <div
                      key={source.citation_number}
                      className="flex gap-2 p-2 bg-gray-900/50 rounded border border-gray-700/50 hover:border-gray-600 transition-colors"
                    >
                      <Badge variant="outline" className="shrink-0 h-fit">
                        {source.citation_number}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-300 font-medium truncate">
                          {source.document_name}
                        </p>
                        <p className="text-xs text-gray-500">Page {source.page_number}</p>
                        {source.excerpt && (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                            "{source.excerpt}"
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Related questions */}
            {response.related_questions.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-2">Related questions</p>
                <div className="space-y-1">
                  {response.related_questions.map((question, i) => (
                    <button
                      key={i}
                      onClick={() => onQuestionClick(question)}
                      className="w-full text-left px-3 py-2 bg-gray-900/50 hover:bg-gray-700/50 rounded border border-gray-700/50 hover:border-indigo-500/50 transition-colors text-xs text-gray-300"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Copy button */}
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyAnswer}
                className="h-8 text-xs text-gray-400 hover:text-white"
              >
                {copiedAnswer ? (
                  <>
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 mr-1" />
                    Copy answer
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function LoadingMessage() {
  return (
    <div className="flex justify-start mb-6">
      <div className="max-w-[85%]">
        <Card className="bg-gray-800/50 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span className="text-sm text-gray-400">Searching knowledge base...</span>
            </div>
            <Skeleton className="h-4 w-full mb-2 bg-gray-700" />
            <Skeleton className="h-4 w-[90%] mb-2 bg-gray-700" />
            <Skeleton className="h-4 w-[75%] bg-gray-700" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function Home() {
  // State
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [documents, setDocuments] = useState<UploadedDocument[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [sessionId] = useState(`session-${Date.now()}`)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // File upload handling
  const handleFileUpload = async (files: FileList | File[]) => {
    const fileArray = Array.isArray(files) ? files : Array.from(files)
    const pdfFiles = fileArray.filter((f) => f.type === 'application/pdf')

    if (pdfFiles.length === 0) {
      return
    }

    // Add documents with uploading status
    const newDocs: UploadedDocument[] = pdfFiles.map((file) => ({
      id: `${file.name}-${Date.now()}`,
      name: file.name,
      size: file.size,
      uploadDate: new Date(),
      status: 'uploading',
    }))

    setDocuments((prev) => [...prev, ...newDocs])

    // Upload each file
    for (let i = 0; i < pdfFiles.length; i++) {
      const file = pdfFiles[i]
      const docId = newDocs[i].id

      try {
        // Step 1: Upload file to get asset_id
        const result = await uploadFiles(file)

        if (result.success && result.asset_ids.length > 0) {
          const assetId = result.asset_ids[0]

          // Step 2: Ingest into RAG knowledge base
          const ingestResult = await ingestFilesToRAG(RAG_ID, [assetId])

          console.log('Upload result:', result)
          console.log('Ingest result:', ingestResult)

          if (ingestResult.success) {
            setDocuments((prev) =>
              prev.map((doc) =>
                doc.id === docId ? { ...doc, status: 'success', asset_id: assetId } : doc
              )
            )
          } else {
            setDocuments((prev) =>
              prev.map((doc) =>
                doc.id === docId
                  ? {
                      ...doc,
                      status: 'error',
                      error: ingestResult.error || 'Failed to add to knowledge base',
                    }
                  : doc
              )
            )
          }
        } else {
          setDocuments((prev) =>
            prev.map((doc) =>
              doc.id === docId
                ? { ...doc, status: 'error', error: result.error || 'Upload failed' }
                : doc
            )
          )
        }
      } catch (error) {
        setDocuments((prev) =>
          prev.map((doc) =>
            doc.id === docId
              ? {
                  ...doc,
                  status: 'error',
                  error: error instanceof Error ? error.message : 'Upload failed',
                }
              : doc
          )
        )
      }
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFileUpload(e.dataTransfer.files)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDeleteDocument = (docId: string) => {
    setDocuments((prev) => prev.filter((doc) => doc.id !== docId))
  }

  const handleClearAll = () => {
    setDocuments([])
  }

  // Search handling
  const handleSearch = async (query: string) => {
    if (!query.trim() || isSearching) return

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setIsSearching(true)

    setTimeout(scrollToBottom, 100)

    try {
      // Call agent - it will use the knowledge base automatically
      const result = await callAIAgent(query, AGENT_ID, {
        session_id: sessionId,
      })

      if (result.success && result.response.status === 'success') {
        const assistantMessage: Message = {
          id: `msg-${Date.now()}-assistant`,
          role: 'assistant',
          content: result.response.result.answer || 'No answer available',
          timestamp: new Date(),
          response: result.response.result as KnowledgeSearchResult,
        }
        setMessages((prev) => [...prev, assistantMessage])
      } else {
        // Handle error response
        const errorMessage: Message = {
          id: `msg-${Date.now()}-error`,
          role: 'assistant',
          content:
            result.response.result?.answer ||
            result.response.message ||
            'Failed to get response',
          timestamp: new Date(),
          response: result.response.result as KnowledgeSearchResult,
        }
        setMessages((prev) => [...prev, errorMessage])
      }
    } catch (error) {
      const errorMessage: Message = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: 'An error occurred while searching. Please try again.',
        timestamp: new Date(),
        response: {
          answer: 'An error occurred while searching. Please try again.',
          sources: [],
          confidence: 0,
          related_questions: [],
        },
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsSearching(false)
      setTimeout(scrollToBottom, 100)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSearch(inputValue)
  }

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const handleRelatedQuestion = (question: string) => {
    setInputValue(question)
    handleSearch(question)
  }

  const handleSuggestedQuery = (query: string) => {
    setInputValue(query)
    handleSearch(query)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const successfulDocs = documents.filter((d) => d.status === 'success').length

  return (
    <div className="h-screen flex bg-[#1a1a2e] overflow-hidden">
      {/* Document Sidebar */}
      <div
        className={cn(
          'flex-shrink-0 border-r border-gray-800 bg-[#16162a] transition-all duration-300',
          sidebarOpen ? 'w-[280px]' : 'w-0'
        )}
      >
        {sidebarOpen && (
          <div className="h-full flex flex-col">
            {/* Sidebar Header */}
            <div className="p-4 border-b border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-white">Documents</h2>
                <Badge variant="outline" className="text-xs">
                  {successfulDocs}
                </Badge>
              </div>

              {/* Upload Zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={cn(
                  'border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors',
                  isDragging
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-gray-700 hover:border-gray-600'
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-6 h-6 text-gray-500 mx-auto mb-2" />
                <p className="text-xs text-gray-400">Drop PDFs here or click</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  multiple
                  onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                  className="hidden"
                />
              </div>
            </div>

            {/* Document List */}
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {documents.length === 0 ? (
                  <EmptyDocumentsState />
                ) : (
                  documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-300 font-medium truncate">
                            {doc.name}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500">
                              {formatFileSize(doc.size)}
                            </span>
                            {doc.status === 'uploading' && (
                              <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                            )}
                            {doc.status === 'success' && (
                              <CheckCircle className="w-3 h-3 text-green-500" />
                            )}
                            {doc.status === 'error' && (
                              <AlertCircle className="w-3 h-3 text-red-500" />
                            )}
                          </div>
                          {doc.error && (
                            <p className="text-xs text-red-400 mt-1">{doc.error}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="text-gray-500 hover:text-red-400 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Clear All Button */}
            {documents.length > 0 && (
              <div className="p-3 border-t border-gray-800">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearAll}
                  className="w-full text-xs"
                >
                  <Trash2 className="w-3 h-3 mr-2" />
                  Clear All
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="h-16 border-b border-gray-800 flex items-center px-6 bg-[#16162a]">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="mr-4 text-gray-400 hover:text-white transition-colors"
          >
            {sidebarOpen ? (
              <ChevronLeft className="w-5 h-5" />
            ) : (
              <ChevronRight className="w-5 h-5" />
            )}
          </button>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/10">
              <Search className="w-4 h-4 text-indigo-500" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Knowledge Search</h1>
              <p className="text-xs text-gray-500">
                Ask questions about your documents
              </p>
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <ScrollArea className="flex-1 bg-[#1a1a2e]">
          <div className="max-w-4xl mx-auto">
            {messages.length === 0 ? (
              <WelcomeState onSuggestedQuery={handleSuggestedQuery} />
            ) : (
              <div className="p-6">
                {messages.map((msg) => (
                  <div key={msg.id}>
                    {msg.role === 'user' ? (
                      <UserMessage content={msg.content} />
                    ) : msg.response ? (
                      <AssistantMessage
                        response={msg.response}
                        onCopy={handleCopyText}
                        onQuestionClick={handleRelatedQuestion}
                      />
                    ) : null}
                  </div>
                ))}
                {isSearching && <LoadingMessage />}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Search Input Bar */}
        <div className="border-t border-gray-800 bg-[#16162a] p-4">
          <div className="max-w-4xl mx-auto">
            <form onSubmit={handleSubmit} className="relative">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask anything about your documents..."
                maxLength={500}
                disabled={isSearching}
                className="pr-12 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 h-12 rounded-xl"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!inputValue.trim() || isSearching}
                className="absolute right-2 top-2 h-8 w-8 p-0 bg-indigo-600 hover:bg-indigo-700"
              >
                {isSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </form>
            <p className="text-xs text-gray-600 mt-2 text-center">
              {inputValue.length}/500 characters
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
