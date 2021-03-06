import * as React from 'react';
import { ChangeEvent, useEffect, useReducer } from 'react';
import { Icon, Input } from 'antd';
import {
  actions,
  setData,
  setMetadata,
  setMetadataVisibilty,
  setProtoVisibility,
  setTSLCertificate,
  setUrl,
} from './actions';
import { Response } from './Response';
import { Metadata } from './Metadata';
import { Controls, isControlVisible } from './Controls';
import { Request } from './Request';
import { Options } from './Options';
import { RequestType } from './RequestType';
import { ProtoFileViewer } from './ProtoFileViewer';
import { Certificate, GRPCRequest, ProtoInfo } from '../../behaviour';
import { getMetadata, getUrl, storeUrl } from '../../storage';

import 'brace/theme/textmate';
import 'brace/mode/json';
import 'brace/mode/protobuf';
import { exportResponseToJSONFile } from "../../behaviour/response";
import Resizable from "re-resizable";

export interface EditorAction {
  [key: string]: any
  type: string
}

export interface EditorRequest {
  url: string
  data: string
  inputs?: string // @deprecated
  metadata: string
  interactive: boolean
  tlsCertificate?: Certificate
}

export interface EditorState extends EditorRequest {
  loading: boolean
  response: EditorResponse
  metadataOpened: boolean
  protoViewVisible: boolean
  requestStreamData: string[]
  responseStreamData: EditorResponse[]
  streamCommitted: boolean
  call?: GRPCRequest
}

export interface EditorProps {
  protoInfo?: ProtoInfo
  onRequestChange?: (editorRequest: EditorRequest & EditorState) => void
  initialRequest?: EditorRequest
}

export interface EditorResponse {
  output: string;
  responseTime?: number;
}

const INITIAL_STATE: EditorState = {
  url: "0.0.0.0:3009",
  data: "",
  metadata: "",
  requestStreamData: [],
  responseStreamData: [],
  interactive: false,
  loading: false,
  response: {
    output: "",
    responseTime: undefined,
  },
  metadataOpened: false,
  protoViewVisible: false,
  streamCommitted: false,
  tlsCertificate: undefined,
  call: undefined,
};

/**
 * Reducer
 * @param state
 * @param action
 */
const reducer = (state: EditorState, action: EditorAction) => {
  switch (action.type) {

    case actions.SET_DATA:
      return { ...state, data: action.data };

    case actions.SET_URL:
      return { ...state, url: action.value };

    case actions.SET_IS_LOADING:
      return { ...state, loading: action.isLoading };

    case actions.SET_RESPONSE:
      return { ...state, response: action.response };

    case actions.SET_CALL:
      return { ...state, call: action.call };

    case actions.SET_METADATA_VISIBILITY:
      return { ...state, metadataOpened: action.visible };

    case actions.SET_METADATA:
      return { ...state, metadata: action.metadata };

    case actions.SET_PROTO_VISIBILITY:
      return { ...state, protoViewVisible: action.visible };

    case actions.SET_INTERACTIVE:
      return { ...state, interactive: action.interactive };

    case actions.SET_REQUEST_STREAM_DATA:
      return { ...state, requestStreamData: action.requestData };

    case actions.SET_RESPONSE_STREAM_DATA:
      return { ...state, responseStreamData: action.responseData };

    case actions.ADD_RESPONSE_STREAM_DATA:
      return { ...state, responseStreamData: [...state.responseStreamData, action.responseData] };

    case actions.SET_STREAM_COMMITTED:
      return { ...state, streamCommitted: action.committed };

    case actions.SET_SSL_CERTIFICATE:
      return { ...state, tlsCertificate: action.certificate };
    default:
      return state
  }
};

export function Editor({ protoInfo, initialRequest, onRequestChange }: EditorProps) {
  const [state, dispatch] = useReducer(reducer, {
    ...INITIAL_STATE,
    url: (initialRequest && initialRequest.url) || getUrl() || INITIAL_STATE.url,
    interactive: initialRequest ? initialRequest.interactive : (protoInfo && protoInfo.usesStream()) || INITIAL_STATE.interactive,
    metadata: (initialRequest && initialRequest.metadata) || getMetadata() || INITIAL_STATE.metadata,
  }, undefined);

  useEffect(() => {
    if (protoInfo && !initialRequest) {
      try {
        const { plain } = protoInfo.service.methodsMocks[protoInfo.methodName]();
        dispatch(setData(JSON.stringify(plain, null, 2)));
      } catch (e) {
        console.error(e);
        dispatch(setData(JSON.stringify({
          "error": "Error parsing the request message, please report the problem sharing the offending protofile"
        }, null, 2)));
      }
    }

    if (initialRequest) {
      dispatch(setData(initialRequest.inputs || initialRequest.data));
      dispatch(setMetadata(initialRequest.metadata));
      dispatch(setTSLCertificate(initialRequest.tlsCertificate));
    }
  }, []);

  return (
    <div style={styles.tabContainer}>
      <div style={styles.inputContainer}>
        <div style={{ width: "50%" }}>
          <Input
            className="server-url"
            addonAfter={(
              <div style={{display: "flex", alignItems: "center", width: "125px"}}>
                {state.loading ? <Icon type="loading"/> : <Icon type="database"/>}
                <RequestType protoInfo={protoInfo} />
              </div>
            )}
            defaultValue={state.url}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              dispatch(setUrl(e.target.value));
              storeUrl(e.target.value);
              onRequestChange && onRequestChange({
                ...state,
                url: e.target.value,
              });
            }}/>
        </div>

        {protoInfo && (
          <Options
            protoInfo={protoInfo}
            dispatch={dispatch}
            interactiveChecked={state.interactive}
            onClickExport={async () => {
              await exportResponseToJSONFile(protoInfo, state)
            }}
            onInteractiveChange={(checked) => {
              onRequestChange && onRequestChange({
                ...state,
                interactive: checked,
              });
            }}
            tlsSelected={state.tlsCertificate}
            onTLSSelected={(certificate) => {
              dispatch(setTSLCertificate(certificate));
              onRequestChange && onRequestChange({
                ...state,
                tlsCertificate: certificate,
              });
            }}
          />
        )}
      </div>

      <div style={styles.editorContainer}>
        <Resizable
            enable={{ right: true }}
            defaultSize={{
              width: "50%",
            }}
            maxWidth={"80%"}
            minWidth={"10%"}
        >
          <Request
            data={state.data}
            streamData={state.requestStreamData}
            onChangeData={(value) => {
              dispatch(setData(value));
              onRequestChange && onRequestChange({
                ...state,
                data: value,
              });
            }}
          />

          <div style={{
            ...styles.playIconContainer,
            ...(isControlVisible(state) ? styles.streamControlsContainer : {}),
          }}>
            <Controls
                dispatch={dispatch}
                state={state}
                protoInfo={protoInfo}
            />
          </div>
        </Resizable>

        <div style={{...styles.responseContainer}}>
          <Response
            streamResponse={state.responseStreamData}
            response={state.response}
          />
        </div>
      </div>

      <Metadata
        onClickMetadata={() => {
          dispatch(setMetadataVisibilty(!state.metadataOpened));
        }}
        onMetadataChange={(value) => {
          dispatch(setMetadata(value));
          onRequestChange && onRequestChange({
            ...state,
            metadata: value,
          });
        }}
        value={state.metadata}
      />

      {protoInfo && (
        <ProtoFileViewer
          protoInfo={protoInfo}
          visible={state.protoViewVisible}
          onClose={() => dispatch(setProtoVisibility(false))}
        />
      )}
    </div>
  )
}

const styles = {
  tabContainer: {
    width: "100%",
    height: "100%",
    position: "relative" as "relative",
  },
  editorContainer: {
    display: "flex",
    height: "100%",
    borderLeft: "1px solid rgba(0, 21, 41, 0.18)",
    background: "#fff"
  },
  responseContainer: {
    background: "white",
    maxWidth: "inherit",
    width: "inherit",
    display: "flex",
    flex: "1 1 0%",
    borderLeft: "1px solid #eee",
    borderRight: "1px solid rgba(0, 21, 41, 0.18)",
    overflow: "auto"
  },
  playIconContainer: {
    position: "absolute" as "absolute",
    zIndex: 10,
    right: "-30px",
    marginLeft: "-25px",
    top: "calc(50% - 80px)",
  },
  streamControlsContainer: {
    right: "-42px",
  },
  inputContainer: {
    display: "flex",
    justifyContent: "space-between",
    border: "1px solid rgba(0, 21, 41, 0.18)",
    borderBottom: "1px solid #eee",
    background: "#fafafa",
    padding: "15px",
    boxShadow: "2px 0px 4px 0px rgba(0,0,0,0.20)",
  },
};
