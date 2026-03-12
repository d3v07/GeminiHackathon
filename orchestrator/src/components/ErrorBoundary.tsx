'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children?: ReactNode;
    fallbackLabel?: string;
    errorOverride?: Error | null;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error(`[ErrorBoundary${this.props.fallbackLabel ? ` — ${this.props.fallbackLabel}` : ''}]`, error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        const errorToShow = this.props.errorOverride || this.state.error;
        const hasError = this.state.hasError || !!this.props.errorOverride;

        if (hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-full w-full bg-[#050608] text-white p-8">
                    <div className="max-w-md text-center space-y-6">
                        <div className="w-16 h-16 mx-auto rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
                            <span className="text-2xl">⚠️</span>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-rose-400 mb-2 tracking-tight">
                                {this.props.fallbackLabel || 'Component'} Error
                            </h3>
                            <p className="text-[12px] font-mono text-gray-500 leading-relaxed">
                                {errorToShow?.message || 'An unexpected error occurred'}
                            </p>
                        </div>
                        <button
                            onClick={this.handleReset}
                            className="px-5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
