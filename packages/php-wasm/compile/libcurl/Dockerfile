FROM playground-php-wasm:base

ARG JSPI

RUN mkdir -p /root/lib/include /root/lib/lib
COPY ./libz/ /root/libz
RUN if [ "$JSPI" = "1" ]; then \
        cp -r /root/libz/jspi/dist/root/lib/* /root/lib; \
    else \
        cp -r /root/libz/asyncify/dist/root/lib/* /root/lib; \
    fi

COPY ./libopenssl/ /root/libopenssl
RUN if [ "$JSPI" = "1" ]; then \
        cp -r /root/libopenssl/jspi/dist/root/lib/* /root/lib; \
    else \
        cp -r /root/libopenssl/asyncify/dist/root/lib/* /root/lib; \
    fi


ARG CURL_VERSION="curl-7.69.1"

RUN /root/copy-lib.sh lib-libz
RUN set -euxo pipefail && \
    source /root/emsdk/emsdk_env.sh && \
    wget https://curl.haxx.se/download/$CURL_VERSION.tar.gz && \
    tar xf $CURL_VERSION.tar.gz

WORKDIR /root/$CURL_VERSION

RUN CPPFLAGS="-I/root/lib/include " \
    LDFLAGS="-L/root/lib/lib " \
    PKG_CONFIG_PATH=$PKG_CONFIG_PATH \
    source /root/emsdk/emsdk_env.sh && \
    emconfigure ./configure \
        --build i386-pc-linux-gnu \
        --target wasm32-unknown-emscripten \
        --prefix=/root/lib/ \
        --disable-shared \
        --enable-static \
        --with-ssl \
        --with-openssl=/root/lib \
        --enable-https \
        --enable-http \
        --disable-pop3 \
        --disable-imap \
        --disable-smb \
        --disable-smtp \
        --disable-telnet \
        --disable-gopher \
        --disable-ftp \
        --disable-ftps \
        --disable-rtsp \
        --disable-tftp \
        --disable-pthreads \
        --disable-threaded-resolver \
        --with-zlib=/root/lib

RUN if [ "$JSPI" = "1" ]; then \
    source /root/emsdk/emsdk_env.sh && \
    EMCC_SKIP="-lc -lz -lcurl -lssl " \
    EMCC_FLAGS="-sSIDE_MODULE -Wl,--wrap=select -sSUPPORT_LONGJMP=wasm -fwasm-exceptions " emmake make || true; \
fi

RUN if [ "$JSPI" != "1" ]; then \
    cp /root/emsdk/upstream/bin/wasm-ld /root/emsdk/upstream/bin/wasm-ld-original && \
    echo $'#!/bin/bash\n\
if [[ " $@ " =~ " -o curl " ]]; then \n\
echo '' > /root/curl-7.69.1/src/curl; \n\
echo '' > /root/curl-7.69.1/curl; \n\
fi; \n\
/root/emsdk/upstream/bin/wasm-ld-original "$@" || true; \n\
exit 0; \n' > /root/emsdk/upstream/bin/wasm-ld && \
    chmod a+x /root/emsdk/upstream/bin/wasm-ld; \
fi

RUN if [ "$JSPI" != "1" ]; then \
    source /root/emsdk/emsdk_env.sh && \
    EMCC_SKIP="-lc -lz -lcurl -lssl " \
    EMCC_FLAGS="-sSIDE_MODULE -Wl,--wrap=select " emmake make -i || true; \
fi

RUN if [ "$JSPI" != "1" ]; then \
    source /root/emsdk/emsdk_env.sh && \
    EMCC_SKIP="-lc -lz -lcurl -lssl " \
    EMCC_FLAGS="-sSIDE_MODULE -Wl,--wrap=select " emmake make install -i || true; \
fi
